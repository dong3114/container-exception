import { Body, Controller, Get, Headers, Inject, Param, Patch } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { RequirePermission } from '../auth/auth.decorators.js';
import { ContactEligibilityDto, CounterpartyListDto, FacilityListDto, FacilitySummaryDto, SetFacilityOperatorRequestDto } from './dto.js';
import { RegistryService } from './registry.service.js';

const ERROR_SCHEMA = { $ref: '#/components/schemas/ErrorResponse' };

/**
 * 등록부 · 발송 자격 조회(T-087 U2 — 첫 업무 endpoint). 읽기 전용.
 * 판정은 Backend 결정론이다 — AI 가 관여하지 않는다(FR-ELG-02).
 */
@ApiTags('registry')
@Controller('registry')
export class RegistryController {
  constructor(@Inject(RegistryService) private readonly registry: RegistryService) {}

  @Get('counterparties')
  @ApiOperation({ summary: 'Counterparties, contacts and addresses with the current send-eligibility verdict per address (FR-CPY-11)' })
  @ApiOkResponse({ type: CounterpartyListDto })
  listCounterparties(): Promise<CounterpartyListDto> {
    return this.registry.listCounterparties();
  }

  @Get('facilities')
  @ApiOperation({ summary: 'Active facilities (warehouse · ODCY · terminal) an inquiry can be about' })
  @ApiOkResponse({ type: FacilityListDto })
  listFacilities(): Promise<FacilityListDto> {
    return this.registry.listFacilities();
  }

  @RequirePermission('registry.manage')
  @Patch('facilities/:facilityId/operator')
  @ApiOperation({ summary: 'Set (or clear) the counterparty that operates a facility. Capacity inquiries and receiving requests go only to that counterparty — never to "the first counterparty with this role"' })
  @ApiParam({ name: 'facilityId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({ name: 'X-CERA-Actor-Id', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Administrator (active HUMAN). In session mode the backend sets it' })
  @ApiBody({ type: SetFacilityOperatorRequestDto })
  @ApiOkResponse({ type: FacilitySummaryDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_REGISTRY_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED · PERMISSION_DENIED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'COUNTERPARTY_INACTIVE', schema: ERROR_SCHEMA })
  @ApiUnprocessableEntityResponse({ description: 'ROLE_MISMATCH', schema: ERROR_SCHEMA })
  setFacilityOperator(@Param('facilityId') facilityId: string, @Headers('x-cera-actor-id') actor: string | undefined, @Body() body: unknown) {
    return this.registry.setFacilityOperator(facilityId, actor, body);
  }

  @Get('addresses/:addressId/eligibility')
  @ApiOperation({ summary: 'Contact Gate verdict for one address: all six conditions and every blocking reason (FR-ELG-04)' })
  // 경로 매개변수를 명시한다 — tsx(esbuild)는 decorator metadata 를 만들지 않아 실행 방식에 따라 문서가 달라지지 않게.
  @ApiParam({ name: 'addressId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({ type: ContactEligibilityDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID — addressId is not a UUID', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'ADDRESS_NOT_FOUND', schema: ERROR_SCHEMA })
  getEligibility(@Param('addressId') addressId: string): Promise<ContactEligibilityDto> {
    return this.registry.getEligibility(addressId);
  }
}
