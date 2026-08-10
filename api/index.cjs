process.env.VERCEL = '1';
const app = require('../server/index.js');

module.exports = (req, res) => {
  return app(req, res);
};
