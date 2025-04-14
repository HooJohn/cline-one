import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import configuration from './configuration';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      load: [configuration]
    })
  ],
  providers: [
    {
      provide: 'CONFIG_PATH',
      useFactory: (config: ConfigService) => config.get('configPath'),
      inject: [ConfigService]
    }
  ],
  exports: ['CONFIG_PATH', NestConfigModule]
})
export class SharedConfigModule {}
