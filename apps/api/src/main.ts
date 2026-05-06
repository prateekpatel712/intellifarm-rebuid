import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import {
  isCorsOriginAllowed,
  resolveAllowedCorsOrigins,
} from './common/utils/cors.util';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const allowedOrigins = new Set(
    resolveAllowedCorsOrigins({
      appUrls: configService.get<string>('APP_URLS'),
      appUrl: configService.get<string>('APP_URL', 'http://localhost:3000'),
      nodeEnv: configService.get<string>('NODE_ENV', 'development'),
    }),
  );

  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, isCorsOriginAllowed(origin, allowedOrigins));
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Intellifarm API')
    .setDescription(
      'Shared backend API for Intellifarm web and future mobile clients.',
    )
    .setVersion('1.0.0')
    .addCookieAuth('access_token')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();
