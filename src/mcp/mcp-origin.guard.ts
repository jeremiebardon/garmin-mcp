import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

@Injectable()
export class McpOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<Request>().headers.origin;
    if (origin !== undefined && !LOOPBACK_ORIGIN.test(origin)) {
      throw new ForbiddenException('Origin not allowed');
    }
    return true;
  }
}
