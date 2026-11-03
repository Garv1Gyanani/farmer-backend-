/** Error carrying an HTTP status code so controllers can bubble it up to the error handler. */
class HttpError extends Error {
  constructor(statusCode, message, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    Object.assign(this, extra);
  }
}

module.exports = HttpError;
