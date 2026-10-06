import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ContactEligibilityDto, CounterpartyListDto, FacilityListDto } from './dto.js';
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
