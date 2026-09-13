/** Server-only Railway API helpers (GraphQL v2). */

const API = "https://backboard.railway.com/graphql/v2";

export function railwayToken(): string {
  return process.env["RAILWAY_API_TOKEN"] || "";
}

export async function gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = railwayToken();
  if (!token) throw new Error("Railway token is missing. Add it in the project secrets.");
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Railway request failed [${res.status}]: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  if (json?.errors?.length) throw new Error(String(json.errors[0]?.message || "Railway error"));
  return json.data as T;
}

export type RailwayService = {
  serviceId: string;
  name: string;
  environmentId: string;
  environmentName: string;
  status: string;
  updatedAt: string;
  url: string;
  deploymentId: string;
};

export type RailwayProject = {
  projectId: string;
  name: string;
  services: RailwayService[];
};

const PROJECTS = `
query {
  me {
    name
    email
    projects {
      edges { node {
        id
        name
        environments { edges { node { id name } } }
        services { edges { node { id name } } }
        deployments(first: 30) {
          edges { node {
            id
            status
            updatedAt
            staticUrl
            serviceId
            environmentId
          } }
        }
      } }
    }
  }
}`;

export async function loadProjects(): Promise<{ account: string; projects: RailwayProject[] }> {
  const data = await gql<any>(PROJECTS);
  const me = data?.me ?? {};
  const projects: RailwayProject[] = (me.projects?.edges ?? []).map((pe: any) => {
    const p = pe.node;
    const envs: { id: string; name: string }[] = (p.environments?.edges ?? []).map((e: any) => e.node);
    const deployments: any[] = (p.deployments?.edges ?? []).map((e: any) => e.node);
    const services: RailwayService[] = (p.services?.edges ?? []).map((se: any) => {
      const s = se.node;
      const dep = deployments.find((d) => d.serviceId === s.id);
      const env = envs.find((e) => e.id === dep?.environmentId) ?? envs[0];
      return {
        serviceId: s.id,
        name: s.name,
        environmentId: env?.id ?? "",
        environmentName: env?.name ?? "",
        status: dep?.status ?? "NO DEPLOYMENT",
        updatedAt: dep?.updatedAt ?? "",
        url: dep?.staticUrl ? `https://${dep.staticUrl}` : "",
        deploymentId: dep?.id ?? "",
      };
    });
    return { projectId: p.id, name: p.name, services };
  });
  return { account: String(me.email || me.name || "Railway account"), projects };
}

export async function redeployService(serviceId: string, environmentId: string): Promise<void> {
  await gql(
    `mutation ($serviceId: String!, $environmentId: String!) {
       serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
     }`,
    { serviceId, environmentId },
  );
}

export async function restartService(serviceId: string, environmentId: string): Promise<void> {
  await gql(
    `mutation ($serviceId: String!, $environmentId: String!) {
       serviceInstanceRestart(serviceId: $serviceId, environmentId: $environmentId)
     }`,
    { serviceId, environmentId },
  );
}
