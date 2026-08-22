import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

/**
 * Adds two `session` columns that exist on the entity but that no migration
 * ever created:
 *
 * - `responseEncryptionPrivateJwk` — added to SessionEntity by #894 (v7.0.0).
 *   Without it, `POST /api/verifier/offer` fails with
 *   `QueryFailedError: column Session.responseEncryptionPrivateJwk does not exist`.
 * - `authorizationServerId` — same class of omission, on the issuance path.
 *
 * Upstream fresh installs come up with `DB_SYNCHRONIZE=true`, so the gap is
 * invisible there. Deployments that upgrade with migrations only — the correct
 * setting for production — get a schema the code cannot query. Found upgrading
 * a real v6.1 database to v7.2.0.
 *
 * espuni fork, numbered above upstream's highest per PATCHES.md §3b.
 * Candidate upstream fix.
 */
export class AddMissingSessionColumns1791000000000
    implements MigrationInterface
{
    name = "AddMissingSessionColumns1791000000000";

    private readonly columns = [
        new TableColumn({
            name: "responseEncryptionPrivateJwk",
            type: "text",
            isNullable: true,
        }),
        new TableColumn({
            name: "authorizationServerId",
            type: "varchar",
            isNullable: true,
        }),
    ];

    public async up(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("session");
        if (!table) {
            console.log("[Migration] session table not found — skipping.");
            return;
        }

        for (const column of this.columns) {
            if (table.columns.some((c) => c.name === column.name)) continue;
            await queryRunner.addColumn("session", column);
            console.log(`[Migration] Added ${column.name} to session.`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("session");
        if (!table) return;

        for (const column of this.columns) {
            if (!table.columns.some((c) => c.name === column.name)) continue;
            await queryRunner.dropColumn("session", column.name);
        }
    }
}
