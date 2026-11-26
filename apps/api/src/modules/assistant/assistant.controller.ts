import { Body, Controller, Inject, Post, Res } from '@nestjs/common';
import { assistantChatSchema, type AssistantChat } from '@nasj/contracts';
import type { Response } from 'express';
import { CurrentUser, type Actor } from '../../common/identity.js';
import { ZodValidationPipe } from '../../common/validation.pipe.js';
import { AssistantService } from './assistant.service.js';

@Controller('api/v1/assistant')
export class AssistantController {
  constructor(@Inject(AssistantService) private readonly assistant: AssistantService) {}
  @Post('chat')
  chat(
    @CurrentUser() actor: Actor,
    @Body(new ZodValidationPipe(assistantChatSchema)) input: AssistantChat,
    @Res() response: Response,
  ) {
    return this.assistant.stream(actor, input, response);
  }
}
