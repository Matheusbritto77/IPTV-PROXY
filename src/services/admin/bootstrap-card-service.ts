import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { renderClientCard } from "../../views/client-template";

type BootstrapCardInput = {
  clientName: string;
  username: string;
  password: string;
  expiresAtIso: string;
};

export class BootstrapCardService {
  private outputDir() {
    return resolve(process.cwd(), "docs", "generated");
  }

  private outputPath() {
    return resolve(this.outputDir(), "bootstrap-client-card.txt");
  }

  async write(input: BootstrapCardInput) {
    const expiresAt = new Date(input.expiresAtIso).toLocaleDateString("pt-BR");
    const card = renderClientCard({
      clientName: input.clientName,
      username: input.username,
      password: input.password,
      smartersUrl: env.APP_BASE_URL,
      xciptvDns: env.APP_BASE_URL,
      expiresAt,
    });

    await mkdir(this.outputDir(), { recursive: true });
    await writeFile(this.outputPath(), `${card}\n`, "utf8");
    logger.info({ path: this.outputPath() }, "bootstrap_client_card_written");
  }
}

export const bootstrapCardService = new BootstrapCardService();
