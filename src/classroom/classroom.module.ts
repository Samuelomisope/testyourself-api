import { Module } from '@nestjs/common';
import { ClassificationModule } from '../classification/classification.module';
import { ProviderModule } from '../provider/provider.module';
import { UploadModule } from '../upload/upload.module';
import { ClassroomController } from './classroom.controller';
import { ClassroomService } from './classroom.service';
import { ClassroomSpeechService } from './speech/classroom-speech.service';
import { GroqTtsProvider } from './speech/groq-tts.provider';
import { TTS_PROVIDER } from './speech/tts-provider';

@Module({
  imports: [ProviderModule, UploadModule, ClassificationModule],
  controllers: [ClassroomController],
  providers: [ClassroomService, ClassroomSpeechService, GroqTtsProvider, { provide: TTS_PROVIDER, useExisting: GroqTtsProvider }],
  exports: [ClassroomService],
})
export class ClassroomModule {}
