import { createRequire } from 'module';
const require = createRequire(import.meta.url);

process.env.VERCEL = '1';
process.env.USE_TURSO = '1';
process.env.TURSO_DATABASE_URL = 'libsql://olympia-reserveline-togethertechgroups-creator.aws-ap-south-1.turso.io';
process.env.TURSO_AUTH_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYzNTM1NTEsImlkIjoiMDE5ZmVhZjYtZGEwMS03M2QzLTg2NjItMDBlNjYzNWNkNjgzIiwia2lkIjoibDRZZTBadGdtdzJDT2VfSUFLX3haYnI2eTl5V0Q4V25ZbjQ4Zng4b092QSIsInJpZCI6IjUxNDE1YjM0LTUxN2EtNGRlNS04NjRjLWVkNjM2ZTA0YTNiMiJ9.mQQWWxKPLnQIIsUSNPqhVJYWwX_vB_9zJ2Uym2T7IDAeb3TptKIjijHBhOIH_FHLC5YMQgpmigPMGN3g9VkLBg';

const app = require('../server/index.js');

export default function handler(req, res) {
  return app(req, res);
}
