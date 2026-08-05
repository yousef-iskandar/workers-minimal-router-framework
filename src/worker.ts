// Workers Minimal Router Framework
// Copyright (C) 2024 https://github.com/yousef-iskandar

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see http://www.gnu.org/licenses/.

// Deploy this to cloudflare workers and set the ACCESS_KEY env variable to a random secret.

// Place all routes in the doInit function at the bottom of the file.
import type { ExecutionContext, ExportedHandler } from "@cloudflare/workers-types";

const segmenter = /([^/\n]+|\/)\/?/gim;

type RouteHandler = (req: Request, env: Env, ctx: ExecutionContext, args: RouteArgs) => Promise<Response> | Response;

type RouteArgs = Record<string, string>;

type RouteNode = {
    children: Record<string, RouteNode>;
    handler?: RouteHandler;
    paramName?: string;
};

let init = false;
let routes: RouteNode = { children: {} };

function addRoute(route: string, func: RouteHandler) {
    const segs = [...route.matchAll(segmenter)].map((a) => a[1]);
    let curRoute = routes;

    for (let level = 0; level < segs.length; level++) {
        const rawSeg = segs[level];
        const isParam = rawSeg.startsWith(":");
        const seg = isParam ? " ARG" : rawSeg;
        const isLast = level == segs.length - 1;
        const nextRoute = curRoute.children[seg];

        if (isLast) {
            if (nextRoute?.handler) {
                throw new Error("Cannot redefine existing route");
            }
            const leaf = nextRoute ?? (curRoute.children[seg] = { children: {} });
            leaf.handler = func;
            if (isParam) {
                leaf.paramName = rawSeg.substring(1);
            }
            return true;
        }

        curRoute = nextRoute ?? (curRoute.children[seg] = { children: {} });
        if (isParam) {
            curRoute.paramName = rawSeg.substring(1);
        }
    }
}

async function allowMethods(req: Request, methods: string[], then: () => Response | Promise<Response>): Promise<Response> {
    if (req.method == "OPTIONS")
        return new Response("", {
            headers: {
                Allow: methods.join(", "),
            },
        });
    let allowed = false;
    methods.forEach((a) => {
        if (req.method == a) {
            allowed = true;
        }
    });
    if (!allowed) {
        return new Response("Method not allowed", { status: 405 });
    }
    return then();
}

const worker = {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        if (!init) doInit(env);
        let path = new URL(request.url).pathname;
        let segs = [...path.matchAll(segmenter)].map((a) => a[1]);

        let route = routes;
        let argsArray: RouteArgs = {};

        for (let level = 0; level < segs.length; level++) {
            const seg = segs[level];
            const exactRoute = route.children[seg];
            const paramRoute = route.children[" ARG"];

            if (exactRoute) {
                route = exactRoute;
            } else if (paramRoute) {
                if (paramRoute.paramName) {
                    argsArray[paramRoute.paramName] = seg;
                }
                route = paramRoute;
            } else {
                break;
            }

            if (level == segs.length - 1 && route.handler) {
                return await route.handler(request, env, ctx, argsArray);
            }
        }

        return new Response("Not found", { status: 404 });
    },
} satisfies ExportedHandler<Env>;

export default worker;

// Put all of your routes here.

function doInit(env: Env) {
    init = true;
    addRoute(
        "/",
        () =>
            new Response(
                `
                    <h1>Workers Minimal Router Framework</h1>
                    <h3><i>By <a href="https://github.com/yousef-iskandar">Yousef Iskandar</a></i></h3>
                    <br/>
                    This is a default page. You can add your own routes by editing the code.`,
                { headers: { "Content-Type": "text/html" } },
            ),
    );

    // Example using the workers environment
    if (!("ACCESS_KEY" in env)) {
        return; // Don't add the routes if the access key is not set
    }

    addRoute("/" + env.ACCESS_KEY, () => new Response("Hello authenticated user!"));

    // Example of a route that only allows POST and PUT requests
    addRoute("/upload", (req, env, ctx, args) => {
        return allowMethods(req, ["POST", "PUT"], () => {
            return new Response(`Upload successful!`);
        });
    });

    //Example with URL parameters
    addRoute("/:user/:message", (req, env, ctx, args) => {
        return allowMethods(req, ["POST"], () => {
            return new Response(`
                <h1>Message to ${args.user}</h1>
                <p>${args.message}</p>
            `);
        });
    });
}
