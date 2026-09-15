import type {
  ActivityItem,
  CommunicationThread,
  ContainerView,
  DataTrustSummary,
  Envelope,
  IsoDateTime,
  OperationsToday,
  RecoveryPlanCurrent,
  ResourceStatus,
  RiskSummary,
  ScenarioInfo,
} from "@/contracts/cera";

/**
 * One method per future backend endpoint. `asOf` is injected (docs/01_project-rules.md 5절):
 * the provider never reads the wall clock.
 *
 * | method                    | future endpoint                          |
 * | ------------------------- | ---------------------------------------- |
 * | getOperationsToday        | GET /operations/today?as_of=             |
 * | getContainers             | GET /containers?as_of=                   |
 * | getRisks                  | GET /risks?as_of=                        |
 * | getResources              | GET /resources?as_of=                    |
 * | getCurrentRecoveryPlan    | GET /recovery-plans/current?as_of=       |
 * | getCommunications         | GET /communications?as_of=               |
 * | getActivity               | GET /activity?as_of=                     |
 * | getDataTrust              | GET /data-trust?as_of=                   |
 * | getScenario               | GET /sim/scenarios/{id}                  |
 */
export interface CeraDataProvider {
  getScenario(): Promise<ScenarioInfo>;
  getOperationsToday(asOf: IsoDateTime): Promise<Envelope<OperationsToday>>;
  getContainers(asOf: IsoDateTime): Promise<Envelope<ContainerView[]>>;
  getRisks(asOf: IsoDateTime): Promise<Envelope<RiskSummary>>;
  getResources(asOf: IsoDateTime): Promise<Envelope<ResourceStatus>>;
  getCurrentRecoveryPlan(asOf: IsoDateTime): Promise<Envelope<RecoveryPlanCurrent>>;
  getCommunications(asOf: IsoDateTime): Promise<Envelope<CommunicationThread[]>>;
  getActivity(asOf: IsoDateTime): Promise<Envelope<ActivityItem[]>>;
  getDataTrust(asOf: IsoDateTime): Promise<Envelope<DataTrustSummary>>;
}
