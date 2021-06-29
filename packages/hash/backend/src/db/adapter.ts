import { DataSource } from "apollo-datasource";
import { DbUnknownEntity } from "src/types/dbTypes";


/**
 * Generic interface to the database.
 */
export interface DBAdapter extends DataSource {

    /** Create a new entity. */
    createEntity(params: {
        namespaceId: string,
        type: string,
        properties: any
    }): Promise<DbUnknownEntity>

}
