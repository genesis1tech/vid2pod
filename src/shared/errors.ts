export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class LicenseError extends AppError {
  constructor(message: string) {
    super(message, 403, 'LICENSE_REQUIRED');
    this.name = 'LicenseError';
  }
}

export class LicenseExpiredError extends AppError {
  constructor(licenseId: string) {
    super(`License ${licenseId} has expired`, 403, 'LICENSE_EXPIRED');
    this.name = 'LicenseExpiredError';
  }
}

export class LicenseRevokedError extends AppError {
  constructor(licenseId: string) {
    super(`License ${licenseId} has been revoked`, 403, 'LICENSE_REVOKED');
    this.name = 'LicenseRevokedError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}
