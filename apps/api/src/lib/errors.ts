export class AppError extends Error {
  details?: unknown;
  constructor(message: string, public statusCode: number, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400);
  }
}

export class DuplicateError extends AppError {
  constructor(duplicate: unknown, message = 'Possible duplicate found') {
    super(message, 409, { duplicate });
  }
}
