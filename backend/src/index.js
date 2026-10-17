'use strict';

require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 8080;

const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`NaSCon '26 API running on port ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
