import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';
import { StudyReminderService } from './study-reminder.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.get<string>('JWT_SECRET') }),
    }),
  ],
  controllers: [EmailController],
  providers: [EmailService, StudyReminderService],
  exports: [EmailService],
})
export class EmailModule {}
