import "dotenv/config";

async function test() {
  try {
    const res = await fetch("https://ais-pre-s5gbg2unnrv7s7h45k56hl-329644517049.europe-west2.run.app/api/health");
    console.log(await res.text());
  } catch (e) {
    console.error(e);
  }
}

test();
