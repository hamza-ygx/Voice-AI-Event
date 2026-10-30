import { cookies } from "next/headers";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import PinScreen from "@/components/PinScreen";
import Booth from "@/components/Booth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const authed = isValidSession((await cookies()).get(SESSION_COOKIE)?.value);
  return authed ? <Booth /> : <PinScreen />;
}
