import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiForbiddenResponse, ApiHeader, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { RequirePermission } from '../auth/auth.decorators.js';
import { ContactEligibilityDto, CounterpartyListDto, CounterpartySummaryDto, CreateContactRequestDto, CreateCounterpartyRequestDto, FacilityListDto, FacilitySummaryDto, RejectAddressRequestDto, SetAddressStatusRequestDto, SetContactActiveRequestDto, SetFacilityOperatorRequestDto } from './dto.js';
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

  @RequirePermission('registry.manage')
  @Post('counterparties')
  @HttpCode(201)
  @ApiOperation({ summary: 'T-127: register a counterparty while runs are open. Same role + same name (case-insensitive) → 409' })
  @ApiHeader({ name: 'X-CERA-Actor-Id', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Administrator (active HUMAN). In session mode the backend sets it' })
  @ApiBody({ type: CreateCounterpartyRequestDto })
  @ApiCreatedResponse({ type: CounterpartySummaryDto })
  @ApiBadRequestResponse({ description: 'INVALID_REGISTRY_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED · PERMISSION_DENIED', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'COUNTERPARTY_ALREADY_REGISTERED', schema: ERROR_SCHEMA })
  createCounterparty(@Headers('x-cera-actor-id') actor: string | undefined, @Body() body: unknown) {
    return this.registry.createCounterparty(actor, body);
  }

  @RequirePermission('registry.manage')
  @Post('counterparties/:counterpartyId/contacts')
  @HttpCode(201)
  @ApiOperation({ summary: 'T-127: add a contact with one channel address. The address starts UNVERIFIED / relationship PENDING — it is never auto-approved; an administrator approves it separately. Same channel + normalized address → 409' })
  @ApiParam({ name: 'counterpartyId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({ name: 'X-CERA-Actor-Id', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Administrator (active HUMAN). In session mode the backend sets it' })
  @ApiBody({ type: CreateContactRequestDto })
  @ApiCreatedResponse({ type: CounterpartySummaryDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_REGISTRY_REQUEST · INVALID_ADDRESS · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED · PERMISSION_DENIED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'ADDRESS_ALREADY_REGISTERED · COUNTERPARTY_INACTIVE', schema: ERROR_SCHEMA })
  createContact(@Param('counterpartyId') counterpartyId: string, @Headers('x-cera-actor-id') actor: string | undefined, @Body() body: unknown) {
    return this.registry.createContact(counterpartyId, actor, body);
  }

  @RequirePermission('registry.manage')
  @Post('addresses/:addressId/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'T-127: an administrator records that the address was confirmed outside CERA and approves the relationship (who · when are kept). Returns the Contact Gate verdict' })
  @ApiParam({ name: 'addressId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({ name: 'X-CERA-Actor-Id', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Administrator (active HUMAN). In session mode the backend sets it' })
  @ApiOkResponse({ type: ContactEligibilityDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED · PERMISSION_DENIED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'ADDRESS_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'ADDRESS_REJECTED', schema: ERROR_SCHEMA })
  approveAddress(@Param('addressId') addressId: string, @Headers('x-cera-actor-id') actor: string | undefined) {
    return this.registry.approveAddress(addressId, actor);
  }

  @RequirePermission('registry.manage')
  @Patch('addresses/:addressId/status')
  @ApiOperation({ summary: 'T-129: pause, retire (INACTIVE) or re-activate an address. The row is never deleted — sent mail and audit keep pointing at it; only future selection, drafts, approvals and sends are blocked by the Contact Gate. A changed e-mail address = retire this one and register a new one' })
  @ApiParam({ name: 'addressId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({ name: 'X-CERA-Actor-Id', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Administrator (active HUMAN). In session mode the backend sets it' })
  @ApiBody({ type: SetAddressStatusRequestDto })
  @ApiOkResponse({ type: ContactEligibilityDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_REGISTRY_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED · PERMISSION_DENIED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'ADDRESS_NOT_FOUND', schema: ERROR_SCHEMA })
  @ApiConflictResponse({ description: 'ADDRESS_REJECTED', schema: ERROR_SCHEMA })
  setAddressStatus(@Param('addressId') addressId: string, @Headers('x-cera-actor-id') actor: string | undefined, @Body() body: unknown) {
    return this.registry.setAddressStatus(addressId, actor, body);
  }

  @RequirePermission('registry.manage')
  @Post('addresses/:addressId/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'T-129: record that this address must not be contacted (relationship REJECTED — final; register a new address to use one again). A person decides; CERA does not read replies to block addresses' })
  @ApiParam({ name: 'addressId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({ name: 'X-CERA-Actor-Id', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Administrator (active HUMAN). In session mode the backend sets it' })
  @ApiBody({ type: RejectAddressRequestDto })
  @ApiOkResponse({ type: ContactEligibilityDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_REGISTRY_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED · PERMISSION_DENIED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'ADDRESS_NOT_FOUND', schema: ERROR_SCHEMA })
  rejectAddress(@Param('addressId') addressId: string, @Headers('x-cera-actor-id') actor: string | undefined, @Body() body: unknown) {
    return this.registry.rejectAddress(addressId, actor, body);
  }

  @RequirePermission('registry.manage')
  @Patch('contacts/:contactId')
  @ApiOperation({ summary: 'T-129: deactivate (person left, no longer responsible) or re-activate a contact. Every address of an inactive contact fails the Contact Gate (CONTACT_INACTIVE)' })
  @ApiParam({ name: 'contactId', required: true, schema: { type: 'string', format: 'uuid' } })
  @ApiHeader({ name: 'X-CERA-Actor-Id', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Administrator (active HUMAN). In session mode the backend sets it' })
  @ApiBody({ type: SetContactActiveRequestDto })
  @ApiOkResponse({ type: CounterpartySummaryDto })
  @ApiBadRequestResponse({ description: 'INVALID_ID · INVALID_REGISTRY_REQUEST · ACTOR_REQUIRED', schema: ERROR_SCHEMA })
  @ApiForbiddenResponse({ description: 'ACTOR_NOT_ALLOWED · PERMISSION_DENIED', schema: ERROR_SCHEMA })
  @ApiNotFoundResponse({ description: 'NOT_FOUND', schema: ERROR_SCHEMA })
  setContactActive(@Param('contactId') contactId: string, @Headers('x-cera-actor-id') actor: string | undefined, @Body() body: unknown) {
    return this.registry.setContactActive(contactId, actor, body);
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
