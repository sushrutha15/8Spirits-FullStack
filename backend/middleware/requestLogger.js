const requestLogger = (req, res, next) => {
  const start = Date.now();

  console.log(`${req.method} ${req.originalUrl} - ${req.ip}`);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const statusEmoji = status >= 500 ? '❌' : status >= 400 ? '⚠️' : '✓';
    
    console.log(
      `${statusEmoji} ${req.method} ${req.originalUrl} ${status} - ${duration}ms`
    );
  });

  next();
};

module.exports = requestLogger;