import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './common/config';

async function bootstrap() {
  void config.jwtSecret; // fail fast when the secret is missing
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn', 'log'] });
  app.set('trust proxy', 1); // real client IP behind the reverse proxy, for rate limiting
  app.use(helmet());
  app.enableCors({ origin: config.webOrigin, credentials: true });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(config.port);
  console.log(`Masar API listening on :${config.port}`);
}
bootstrap();
