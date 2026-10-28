import { HttpException } from '@nestjs/common';

export class ApiException extends HttpException {
  constructor(status: number, code: string, message: string, operationId?: string) {
    super({ code, message, ...(operationId ? { operationId } : {}) }, status);
  }
}
