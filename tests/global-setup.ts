export default function setup() {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost/testdb';
  process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  process.env.S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:9000';
  process.env.S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || 'testkey';
  process.env.S3_SECRET_KEY = process.env.S3_SECRET_KEY || 'testsecret';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-placeholder-minimum-length';
}
