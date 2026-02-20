import { NextResponse } from "next/server";

export async function POST() {
    const response = NextResponse.json({ status: "ok" });
    response.cookies.set("contextcache_session", "", {
        maxAge: 0,
        path: "/",
        httpOnly: true,
        sameSite: "lax",
    });
    return response;
}
