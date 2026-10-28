import { Global, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Config } from '../config/config';

@Global()
@Module({
  imports: [
    SequelizeModule.forRootAsync({
      inject: [Config],
      useFactory: (config: Config) => ({
        dialect: 'postgres' as const,
        uri: config.values.DATABASE_URL,
        autoLoadModels: true,
        synchronize: false,
        logging: false,
        retryAttempts: 2,
        pool: { min: 0, max: 5, acquire: 10000, idle: 10000 },
      }),
    }),
  ],
  exports: [SequelizeModule],
})
export class DatabaseModule {}
