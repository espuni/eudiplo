import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

/**
 * Add the `readerAuth` column to `presentation_config`.
 *
 * When enabled, the ISO 18013-7 Annex C (DC API) DeviceRequest embeds a detached
 * `readerAuth` COSE_Sign1 signed with the tenant's Access key chain, allowing the
 * wallet to cryptographically authenticate the verifier. Nullable — a null value
 * means disabled.
 */
export class AddReaderAuthToPresentationConfig1774000000000
    implements MigrationInterface
{
    name = "AddReaderAuthToPresentationConfig1774000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("presentation_config");
        if (!table) {
            console.log(
                "[Migration] presentation_config table not found — skipping.",
            );
            return;
        }

        if (!table.columns.some((c) => c.name === "readerAuth")) {
            await queryRunner.addColumn(
                "presentation_config",
                new TableColumn({
                    name: "readerAuth",
                    type: "boolean",
                    isNullable: true,
                }),
            );
            console.log(
                "[Migration] Added readerAuth column to presentation_config.",
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("presentation_config");
        if (!table) return;

        if (table.columns.some((c) => c.name === "readerAuth")) {
            await queryRunner.dropColumn("presentation_config", "readerAuth");
        }
    }
}
