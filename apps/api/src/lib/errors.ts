export class AppError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = new.target.name;
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
