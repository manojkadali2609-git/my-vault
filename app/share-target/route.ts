import { NextResponse } from "next/server";

function getPublicOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");

  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const params = new URLSearchParams();
  const url = new URL(request.url);

  const title = url.searchParams.get("title");
  const text = url.searchParams.get("text");
  const sharedUrl = url.searchParams.get("url");

  if (title) {
    params.set("shared_title", title);
  }

  if (text) {
    params.set("shared_text", text);
  }

  if (sharedUrl) {
    params.set("shared_url", sharedUrl);
  }

  const origin = getPublicOrigin(request);
  const redirectUrl = new URL("/", origin);

  if (params.toString()) {
    redirectUrl.search = params.toString();
  }

  return NextResponse.redirect(redirectUrl, 303);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();

    const title = String(form.get("title") || "");
    const text = String(form.get("text") || "");
    const sharedUrl = String(form.get("url") || "");

    const params = new URLSearchParams();

    if (title) {
      params.set("shared_title", title);
    }

    if (text) {
      params.set("shared_text", text);
    }

    if (sharedUrl) {
      params.set("shared_url", sharedUrl);
    }

    const origin = getPublicOrigin(request);
    const redirectUrl = new URL("/", origin);

    if (params.toString()) {
      redirectUrl.search = params.toString();
    }

    return NextResponse.redirect(redirectUrl, 303);
  } catch {
    const origin = getPublicOrigin(request);

    return NextResponse.redirect(
      new URL("/", origin),
      303
    );
  }
}