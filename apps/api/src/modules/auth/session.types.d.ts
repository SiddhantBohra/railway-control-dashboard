import 'express-session';
import 'passport';

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
    authenticatedAt?: number;
  }
}
declare global {
  namespace Express {
    interface User {
      subject: string;
    }
  }
}
