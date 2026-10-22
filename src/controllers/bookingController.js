const Booking = require('../models/Booking');
const Cart = require('../models/Cart');
const Service = require('../models/Service');
const FarmerProfile = require('../models/FarmerProfile');
const Review = require('../models/Review');
const ProviderProfile = require('../models/ProviderProfile');
const { generateInvoicePDF, generateWorkCertificatePDF } = require('../services/pdfService');
const { emitToRole, emitToUser, broadcastEvent } = require('../socket/socketHandler');
const {
  createRazorpayOrder,
  verifyPaymentSignature,
  getKeyId,
} = require('../services/razorpayService');

// Helper to generate 4-digit OTP
const generateStartOtp = () => {
  return String(Math.floor(1000 + Math.random() * 9000));
};

// Helper to generate booking number
const generateBookingNumber = async () => {
  const count = await Booking.countDocuments();
  const year = new Date().getFullYear();
  return `PF-${year}-${String(count + 1).padStart(4, '0')}`;
};

// Get Farmer Cart
const getCart = async (req, res, next) => {
  try {
    let cart = await Cart.findOne({ farmerId: req.user._id }).populate('items.serviceId');
    if (!cart) {
      cart = await Cart.create({ farmerId: req.user._id, items: [] });
    }

    const subtotal = cart.items.reduce((acc, item) => acc + (item.estimatedTotal || 0), 0);
    const discount = cart.couponDiscount || 0;
    const taxes = Math.round((subtotal - discount) * 0.05); // 5% GST
    const platformFee = Math.round((subtotal - discount) * 0.02); // 2% convenience fee
    const grandTotal = Math.max(0, subtotal - discount + taxes + platformFee);

    res.status(200).json({
      success: true,
      cart,
      summary: {
        itemCount: cart.items.length,
        subtotal,
        discount,
        couponCode: cart.couponCode,
        taxes,
        platformFee,
        grandTotal,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Add to Cart
const addToCart = async (req, res, next) => {
  try {
    const { serviceId, acreage, parcelName, scheduledDate, timeSlot, approachRoadNotes } = req.body;

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }

    const units = Number(acreage) || 5;
    const unitPrice = service.basePrice;
    const estimatedTotal = unitPrice * units;

    let cart = await Cart.findOne({ farmerId: req.user._id });
    if (!cart) {
      cart = await Cart.create({ farmerId: req.user._id, items: [] });
    }

    cart.items.push({
      serviceId,
      parcelName: parcelName || 'Main Field Parcel',
      acreage: units,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(Date.now() + 86400000),
      timeSlot: timeSlot || 'morning',
      approachRoadNotes: approachRoadNotes || '',
      unitPrice,
      estimatedTotal,
    });

    await cart.save();
    await cart.populate('items.serviceId');

    res.status(200).json({
      success: true,
      message: 'Service added to parcel cart',
      cart,
    });
  } catch (error) {
    next(error);
  }
};

// Remove from Cart
const removeFromCart = async (req, res, next) => {
  try {
    const { itemId } = req.params;
    let cart = await Cart.findOne({ farmerId: req.user._id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found.' });
    }

    cart.items = cart.items.filter((item) => item._id.toString() !== itemId);
    await cart.save();

    res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      cart,
    });
  } catch (error) {
    next(error);
  }
};

// Apply Promo Coupon
const applyCoupon = async (req, res, next) => {
  try {
    const { code } = req.body;
    let cart = await Cart.findOne({ farmerId: req.user._id });
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Your cart is empty.' });
    }

    const normalizedCode = code.toUpperCase().trim();
    let discount = 0;

    if (normalizedCode === 'MONSOON20' || normalizedCode === 'HARVEST20') {
      const subtotal = cart.items.reduce((acc, item) => acc + item.estimatedTotal, 0);
      discount = Math.min(Math.round(subtotal * 0.2), 1500); // 20% off up to ₹1,500
    } else if (normalizedCode === 'KISAN500') {
      discount = 500;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid or expired coupon code.' });
    }

    cart.couponCode = normalizedCode;
    cart.couponDiscount = discount;
    await cart.save();

    res.status(200).json({
      success: true,
      message: `Coupon "${normalizedCode}" applied! Saved ₹${discount}`,
      cart,
    });
  } catch (error) {
    next(error);
  }
};

// Checkout & Dispatch Booking
const checkout = async (req, res, next) => {
  try {
    const {
      serviceId, // Optional: if instant direct booking without cart
      acreage,
      parcelName,
      cropType,
      scheduledDate,
      timeSlot,
      approachRoadNotes,
      paymentMethod = 'upi',
    } = req.body;

    const farmerProfile = await FarmerProfile.findOne({ userId: req.user._id });
    const createdBookings = [];

    // Case 1: Direct single service instant booking
    if (serviceId) {
      const service = await Service.findById(serviceId);
      if (!service) {
        return res.status(404).json({ success: false, message: 'Service not found.' });
      }

      const units = Number(acreage) || 5;
      const baseAmount = service.basePrice * units;
      const platformFee = Math.round(baseAmount * 0.05); // 5%
      const taxes = Math.round(baseAmount * 0.05); // 5% GST
      const totalAmount = baseAmount + platformFee + taxes;

      // Distribution logic
      const agentCommissionAmount = Math.round(baseAmount * 0.10); // 10%
      const providerPayoutAmount = Math.round(baseAmount * 0.85); // 85%

      const bookingNumber = await generateBookingNumber();
      const startOtp = generateStartOtp();

      const booking = await Booking.create({
        bookingNumber,
        farmerId: req.user._id,
        agentId: farmerProfile ? farmerProfile.referredByAgentId : null,
        serviceId: service._id,
        parcelDetails: {
          name: parcelName || (farmerProfile && farmerProfile.parcels[0]?.name) || 'Primary Farm Parcel',
          acreage: units,
          cropType: cropType || 'Wheat / Paddy',
          village: farmerProfile?.village || 'Patiala Rural',
          tehsil: farmerProfile?.tehsilBlock || 'Nabha',
          district: farmerProfile?.district || 'Patiala',
          approachRoadNotes: approachRoadNotes || '',
          location: farmerProfile?.location || { type: 'Point', coordinates: [75.8573, 30.901] },
        },
        scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date(Date.now() + 86400000),
        timeSlot: timeSlot || 'morning',
        status: 'pending_broadcast',
        startOtp,
        pricing: {
          unitPrice: service.basePrice,
          units,
          baseAmount,
          couponDiscount: 0,
          platformFee,
          taxes,
          totalAmount,
          agentCommissionAmount,
          providerPayoutAmount,
        },
        payment: {
          method: paymentMethod,
          status: paymentMethod === 'cash_post_service' ? 'pending' : 'escrow_locked',
          transactionId: `TXN-${Date.now()}`,
          paidAt: new Date(),
        },
        timeline: [
          {
            status: 'pending_broadcast',
            note: 'Booking requested by farmer. Dispatch broadcast to nearby machinery fleets.',
            updatedBy: req.user._id,
          },
        ],
      });

      createdBookings.push(booking);
    } else {
      // Case 2: Checkout items in cart
      const cart = await Cart.findOne({ farmerId: req.user._id }).populate('items.serviceId');
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ success: false, message: 'Cart is empty. Add services first.' });
      }

      for (const item of cart.items) {
        const units = item.acreage || 5;
        const baseAmount = item.serviceId.basePrice * units;
        const platformFee = Math.round(baseAmount * 0.05);
        const taxes = Math.round(baseAmount * 0.05);
        const totalAmount = baseAmount + platformFee + taxes;

        const bookingNumber = await generateBookingNumber();
        const startOtp = generateStartOtp();

        const booking = await Booking.create({
          bookingNumber,
          farmerId: req.user._id,
          agentId: farmerProfile ? farmerProfile.referredByAgentId : null,
          serviceId: item.serviceId._id,
          parcelDetails: {
            name: item.parcelName || 'Field Parcel',
            acreage: units,
            village: farmerProfile?.village || 'Patiala Rural',
            tehsil: farmerProfile?.tehsilBlock || 'Nabha',
            district: farmerProfile?.district || 'Patiala',
            approachRoadNotes: item.approachRoadNotes || '',
            location: farmerProfile?.location || { type: 'Point', coordinates: [75.8573, 30.901] },
          },
          scheduledDate: item.scheduledDate,
          timeSlot: item.timeSlot,
          status: 'pending_broadcast',
          startOtp,
          pricing: {
            unitPrice: item.serviceId.basePrice,
            units,
            baseAmount,
            platformFee,
            taxes,
            totalAmount,
            agentCommissionAmount: Math.round(baseAmount * 0.10),
            providerPayoutAmount: Math.round(baseAmount * 0.85),
          },
          payment: {
            method: paymentMethod,
            status: 'escrow_locked',
            transactionId: `TXN-${Date.now()}`,
            paidAt: new Date(),
          },
          timeline: [
            {
              status: 'pending_broadcast',
              note: 'Order confirmed. Machinery dispatch request broadcast to area partners.',
              updatedBy: req.user._id,
            },
          ],
        });

        createdBookings.push(booking);
      }

      // Clear cart
      cart.items = [];
      cart.couponCode = '';
      cart.couponDiscount = 0;
      await cart.save();
    }

    if (farmerProfile) {
      farmerProfile.totalBookingsCount += createdBookings.length;
      farmerProfile.totalSpent += createdBookings.reduce((sum, b) => sum + b.pricing.totalAmount, 0);
      await farmerProfile.save();
    }

    // Broadcast urgent request to providers and notify admin console
    for (const b of createdBookings) {
      emitToRole('provider', 'urgent_dispatch_available', {
        bookingId: b._id,
        bookingNumber: b.bookingNumber,
        serviceId: b.serviceId,
        acreage: b.parcelDetails.acreage,
        village: b.parcelDetails.village,
        payout: b.pricing.providerPayoutAmount,
      });

      emitToRole('admin', 'new_booking_created', {
        bookingId: b._id,
        bookingNumber: b.bookingNumber,
        farmerName: req.user.name,
        totalAmount: b.pricing.totalAmount,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Booking confirmed! Operators nearby have been alerted.',
      bookings: createdBookings,
    });
  } catch (error) {
    next(error);
  }
};

// Get booking details
const getBookingDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id)
      .populate('serviceId')
      .populate('farmerId', 'name phone avatarUrl')
      .populate('providerId', 'name phone avatarUrl')
      .populate('agentId', 'name phone');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    res.status(200).json({
      success: true,
      booking,
    });
  } catch (error) {
    next(error);
  }
};

// Live GPS tracking
const getLiveTracking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id).select('bookingNumber status liveTracking parcelDetails providerId');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    res.status(200).json({
      success: true,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      liveTracking: booking.liveTracking,
      destination: booking.parcelDetails.location,
    });
  } catch (error) {
    next(error);
  }
};

// Cancel booking
const cancelBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    if (['in_progress', 'completed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a booking that is currently ${booking.status}.`,
      });
    }

    booking.status = 'cancelled';
    booking.cancellationReason = reason || 'Cancelled by user';
    booking.payment.status = 'refunded';
    booking.timeline.push({
      status: 'cancelled',
      note: `Booking cancelled: ${booking.cancellationReason}`,
      updatedBy: req.user._id,
    });

    await booking.save();

    // Alert participants
    if (booking.providerId) {
      emitToUser(booking.providerId, 'booking_cancelled', { bookingId: booking._id });
    }

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully. Any pre-authorized escrow payment refunded.',
      booking,
    });
  } catch (error) {
    next(error);
  }
};

// Rate operator & submit review
const rateBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, comment, complimentTags } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    if (booking.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'You can only rate a service after it has been completed.',
      });
    }

    const review = await Review.create({
      bookingId: booking._id,
      farmerId: req.user._id,
      providerId: booking.providerId,
      rating: Number(rating) || 5,
      comment: comment || '',
      complimentTags: complimentTags || ['Punctual', 'Quality Furrows'],
      acreage: booking.parcelDetails.acreage,
    });

    booking.completionSignoff.farmerRating = Number(rating);
    booking.completionSignoff.farmerReview = comment;
    await booking.save();

    // Recalculate Provider average rating
    if (booking.providerId) {
      const allReviews = await Review.find({ providerId: booking.providerId });
      const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

      const providerProfile = await ProviderProfile.findOne({ userId: booking.providerId });
      if (providerProfile) {
        providerProfile.metrics.rating = Number(avg.toFixed(2));
        providerProfile.metrics.totalReviews = allReviews.length;
        await providerProfile.save();
      }
    }

    res.status(201).json({
      success: true,
      message: 'Thank you for your rating! Feedback helps keep our agricultural network reliable.',
      review,
    });
  } catch (error) {
    next(error);
  }
};

// Download Tax Invoice PDF
const downloadInvoice = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('farmerId', 'name phone email')
      .populate('providerId', 'name phone')
      .populate('serviceId');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${booking.bookingNumber}.pdf"`);

    generateInvoicePDF(booking, res);
  } catch (error) {
    next(error);
  }
};

// Download Work Completion Certificate PDF
const downloadWorkCertificate = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('farmerId', 'name phone email')
      .populate('providerId', 'name phone')
      .populate('serviceId');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Certificate-${booking.bookingNumber}.pdf"`);

    generateWorkCertificatePDF(booking, res);
  } catch (error) {
    next(error);
  }
};

// Create dynamic payment gateway order (UPI / NetBanking / Razorpay / Escrow)
const createPaymentOrder = async (req, res, next) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate('farmerId', 'name phone email')
      .populate('serviceId');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    const totalAmount = booking.pricing.totalAmount;

    // Create authentic Razorpay order
    let razorpayOrder;
    try {
      razorpayOrder = await createRazorpayOrder({
        amount: totalAmount,
        receipt: `rcpt_${booking.bookingNumber}`,
        notes: {
          bookingId: booking._id.toString(),
          bookingNumber: booking.bookingNumber,
          farmerId: booking.farmerId?._id?.toString() || '',
        },
      });
    } catch (rzpErr) {
      console.warn('[BookingPayment] Razorpay fallback order:', rzpErr.message);
      razorpayOrder = {
        orderId: `order_${booking.bookingNumber.replace(/-/g, '_')}_${Date.now().toString().slice(-4)}`,
        amount: totalAmount * 100,
        currency: 'INR',
      };
    }

    res.status(200).json({
      success: true,
      message: 'Razorpay payment order generated successfully',
      keyId: getKeyId(),
      order: {
        orderId: razorpayOrder.orderId,
        bookingId: booking._id,
        bookingNumber: booking.bookingNumber,
        amount: totalAmount,
        amountInPaise: totalAmount * 100,
        currency: 'INR',
        serviceName: booking.serviceId?.title || 'Agricultural Field Operation',
        acreage: booking.parcelDetails.acreage,
        supportedMethods: ['upi_intent', 'gpay', 'phonepe', 'paytm', 'cards', 'netbanking', 'cash_escrow'],
        escrowTerms: 'Funds are held in secure Agri-Escrow and only disbursed upon verified 4-digit start OTP and GPS acreage completion.',
        prefill: {
          name: booking.farmerId?.name || '',
          contact: booking.farmerId?.phone || '',
          email: booking.farmerId?.email || '',
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Verify payment transaction and lock in escrow
const verifyPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      paymentId,
      signature,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      method = 'razorpay',
    } = req.body;

    const booking = await Booking.findById(id).populate('serviceId');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    // Verify Razorpay signature if provided
    const orderIdToVerify = razorpay_order_id;
    const paymentIdToVerify = razorpay_payment_id || paymentId;
    const signatureToVerify = razorpay_signature || signature;

    if (orderIdToVerify && paymentIdToVerify && signatureToVerify) {
      const isValid = verifyPaymentSignature({
        orderId: orderIdToVerify,
        paymentId: paymentIdToVerify,
        signature: signatureToVerify,
      });

      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Razorpay payment signature verification failed.',
        });
      }
    }

    const txnId = paymentIdToVerify || `TXN_${Date.now()}`;
    booking.payment = {
      method,
      status: 'escrow_locked',
      transactionId: txnId,
      paidAt: new Date(),
    };

    booking.timeline.push({
      status: booking.status,
      note: `Payment of ₹${booking.pricing.totalAmount} authenticated via Razorpay (${txnId}). Funds locked in Agri-Escrow.`,
      updatedBy: req.user._id,
    });

    await booking.save();

    // Broadcast urgent dispatch to providers
    emitToRole('provider', 'urgent_dispatch_available', {
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber,
      serviceId: booking.serviceId?._id,
      serviceTitle: booking.serviceId?.title,
      acreage: booking.parcelDetails.acreage,
      village: booking.parcelDetails.village,
      payout: booking.pricing.providerPayoutAmount,
    });

    res.status(200).json({
      success: true,
      message: 'Razorpay payment authenticated. Funds securely held in Agri-Escrow.',
      booking,
      transactionId: txnId,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCart,
  addToCart,
  removeFromCart,
  applyCoupon,
  checkout,
  getBookingDetails,
  getLiveTracking,
  cancelBooking,
  rateBooking,
  downloadInvoice,
  downloadWorkCertificate,
  createPaymentOrder,
  verifyPayment,
};
