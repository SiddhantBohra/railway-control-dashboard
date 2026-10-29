// Checked against railwayapp/cli src/gql/schema.json and official API docs, 2026-10-28.
// Response validation is always enabled. Static schema review is not a live mutation test.
const deploymentFields = `id status createdAt updatedAt projectId environmentId serviceId instances { id status }`;

export const SNAPSHOT = `query ControlSnapshot($projectId: String!, $serviceId: String!, $environmentId: String!, $input: DeploymentListInput!) {
  environment(id: $environmentId, projectId: $projectId) {
    id config(decryptVariables: false)
  }
  serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
    serviceId environmentId numReplicas sleepApplication source { image repo }
    activeDeployments { ${deploymentFields} }
    latestDeployment { ${deploymentFields} }
  }
  deployments(input: $input, first: 20) {
    edges { node { ${deploymentFields} } }
    pageInfo { hasNextPage }
  }
}`;
export const DEPLOYMENT = `query ControlDeployment($id: String!) { deployment(id: $id) { ${deploymentFields} } }`;
export const START = `mutation ControlStart($serviceId: String!, $environmentId: String!) {
  serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
}`;
export const REMOVE = `mutation ControlRemove($id: String!) { deploymentRemove(id: $id) }`;
