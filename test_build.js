import { build } from 'vite';

async function run() {
  try {
    await build();
    console.log("Build passed!");
  } catch (e) {
    console.error("CAUGHT VITE SUMMARY:");
    console.error(e.message);
    if (e.errors) {
       for (const err of e.errors) {
         console.error(err);
       }
    }
  }
}
run();
