# HASH DB recovery playbook

Something went terribly wrong with the database, here’s how to recover.

## Identify snapshot to restore

For the production DB located in `us-east-1` see the [snapshots](https://us-east-1.console.aws.amazon.com/rds/home?region=us-east-1#snapshots-list:tab=automated). Identify the snapshot to restore from, usually the one from the current morning or the day before if the incident happened.
The snapshots for HASH would be prefixed with `rds:h-hash-prod-usea1-pg-`

## Restore database

In the resource definition for the RDS instance you can provide a `snapshot-identifier` to restore from. In the [`../hash/postgres/postgres.tf`](../hash/postgres/postgres.tf) file, provide the snapshot name identified in the previous step and run through the Terraform apply process. You may have to add a `create_before_destroy` lifecycle block to the resource to force Terraform to recreate the database, which would work best if you provide the resource a different name.

```diff
resource "aws_db_instance" "postgres" {
  # ...
+ identifier                      = "${var.prefix}-pgYYMMDD"
+ snapshot_identifier = "rds:h-hash-prod-usea1-pg-YYYY-MM-DD-HH-mm"
+ lifecycle {
+   create_before_destroy = true
+ }
}
```

The `apply` step will take a while, as the database is being recreated in its entirety from the snapshot. You can check the status of database by running this AWS CLI command:

```console
$ aws rds wait db-instance-available --db-instance-identifier $(h-hash-prod-usea1-pgYYMMDD)
..
```

This command will block the current terminal until the DB instance has the `available` status.

At the end of the `apply` process, the ECS cluster should be automatically updated to point to the new, restored database.
