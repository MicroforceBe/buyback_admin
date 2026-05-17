export async function saveCloudResult({
  cloudSessionToken,
  testKey,
  status,
}: {
  cloudSessionToken: string;
  testKey: string;
  status: string;
}) {
  try {
    await fetch(
      "http://localhost:3010/diagnostics/session/update",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          sessionId: cloudSessionToken,
          status: "running",
          result: {
            [testKey]: status,
          },
        }),
      }
    );
  } catch (error) {
    console.error(error);
  }
}
