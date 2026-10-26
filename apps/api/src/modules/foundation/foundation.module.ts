import { Module } from '@nestjs/common';
import { AccessService } from './access.service.js';
import { PolicyService } from './policy.service.js';
import { ResourcePolicyService } from './resource-policy.service.js';
@Module({
  providers: [PolicyService, AccessService, ResourcePolicyService],
  exports: [PolicyService, AccessService, ResourcePolicyService],
})
export class FoundationModule {}