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

// 409 para el choque de estado: la operación es válida, pero el registro está en un estado que no
// la admite. Distinto de DuplicateError, que es un choque de datos y lleva el duplicado adentro.
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}
