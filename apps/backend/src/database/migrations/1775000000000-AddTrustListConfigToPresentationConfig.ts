import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

/**
 * Add the `trustListConfig` column to `presentation_config`.
 *
 * Verifier-side settings, keyed by trust list URL, for the trust lists
 * referenced from `dcql_query.credentials[].trusted_authorities` — notably to
 * point an `etsi_tl` authority at an ETSI TS 119 612 XML list (format, scheme
 * operator signer certificates, service-type mapping, accepted status).
 * Nullable.
 */
export class AddTrustListConfigToPresentationConfig1775000000000
    implements MigrationInterface
{
    name = "AddTrustListConfigToPresentationConfig1775000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("presentation_config");
        if (!table) {
            console.log(
                "[Migration] presentation_config table not found — skipping.",
            );
            return;
        }

        if (!table.columns.some((c) => c.name === "trustListConfig")) {
            await queryRunner.addColumn(
                "presentation_config",
                new TableColumn({
                    name: "trustListConfig",
                    type: "json",
                    isNullable: true,
                }),
            );
            console.log(
                "[Migration] Added trustListConfig column to presentation_config.",
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("presentation_config");
        if (!table) return;

        if (table.columns.some((c) => c.name === "trustListConfig")) {
            await queryRunner.dropColumn(
                "presentation_config",
                "trustListConfig",
            );
        }
    }
}
