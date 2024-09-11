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

const segmenter = /([^/\n]+|\/)\/?/gim

let init = false;
let routes = {}

function addRoute(route, func) {
    let segs = [...route.matchAll(segmenter)].map(a => a[1])
    let curRoute = routes;
    let lastRoute;
    let level = 0;

    let path = []
    while (true) {
        lastRoute = curRoute;
        let seg = segs[level];
        let arg = false
        if (/^:/.test(seg)) {
            arg = seg.substring(1)
            seg = " ARG"
        }
        curRoute = curRoute[seg];

        if (typeof curRoute == "function") {
            if (level == segs.length - 1) {
                throw new Error("Cannot redefine existing route")
            }
            lastRoute[seg] = { " ": curRoute }
            curRoute = lastRoute[seg]
        } else if (level == segs.length - 1) {
            if (typeof curRoute == "object") {
                if (curRoute[" "]) {
                    throw new Error("Cannot redefine existing route")
                }
                curRoute[" "] = func
                if (arg) {
                    curRoute[" ARGNAME"] = arg
                }
                return true;
            } else {
                lastRoute[seg] = func
                if (arg) {
                    lastRoute[" ARGNAME"] = arg
                }
                return true;
            }
        } else if (typeof curRoute == "undefined") {
            lastRoute[seg] = {}
            if (arg) {
                lastRoute[" ARGNAME"] = arg
            }
            curRoute = lastRoute[seg]
        }
        level++
    }
}

async function allowMethods(req, methods, then) {
    if (req.method == "OPTIONS") return new Response("", {
        headers: {
            Allow: methods.join(", ")
        }
    })
    let allowed = false;
    methods.forEach((a) => {
        if (req.method == a) {
            allowed = true
        }
    })
    if (!allowed) {
        return new Response("Method not allowed", { status: 405 })
    }
    return then()
}

export default {
    async fetch(request, env, ctx) {
        if (!init) doInit(env)
        let host = request.headers.get("host")
        let path = request.url.split(host)[1]
        let segs = [...path.matchAll(segmenter)].map(a => a[1])

        let timeToLive = 8
        let route = routes;
        let level = 0;
        let argsArray = []

        while (timeToLive > 0) {
            timeToLive--;

            if (!route[segs[level]] && route[" ARG"]) {
                argsArray[route[" ARGNAME"]] = segs[level]
                route = route[" ARG"]
            } else if (route[segs[level]]) {
                route = route[segs[level]]
            } else break

            if (level == segs.length - 1) {
                if (typeof route == "function") {
                    return route(request, env, ctx, argsArray)
                }
                if (typeof route?.[" "] == "function") {
                    return route[" "](request, env, ctx, argsArray)
                }
                break;
            }
            level++
        }

        return new Response("Not found", { status: 404 })
    },
};

// Put all of your routes here.

function doInit(env) {
    init = true;
    addRoute("/", () =>
        new Response(`
        <h1>Workers Minimal Router Framework</h1>
        <h3><i>By <a href="https://github.com/yousef-iskandar">Yousef Iskandar</a></i></h3>
        <br/>
        This is a default page. You can add your own routes by editing the code.`)
    )

    // Example using the workers environment
    if (!env.ACCESS_KEY) {
        return; // Don't add the routes if the access key is not set
    }

    addRoute("/" + (env.ACCESS_KEY), (_, env) =>
        new Response("Hello authenticated user!")
    )

    // Example of a route that only allows POST and PUT requests
    addRoute("/upload", (req, env, ctx, args) => {
        return allowMethods(req, ["POST", "PUT"], () => {
            return new Response(`Upload successful!`)
        })
    })

    //Example with URL parameters
    addRoute("/:user/:message", (req, env, ctx, args) => {
        return allowMethods(req, ["POST"], () => {
            return new Response(`
                <h1>Message to ${args.user}</h1>
                <p>${args.message}</p>
            `)
        })
    })
}