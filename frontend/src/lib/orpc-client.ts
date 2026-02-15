import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import { apiContract } from "../../../shared/orpc/contract";

const link = new RPCLink({
  url: "/api/rpc",
  fetch: async (request, init) => {
    return fetch(request, { ...init, credentials: "include" });
  },
});

export const apiClient: ContractRouterClient<typeof apiContract> = createORPCClient(link);
