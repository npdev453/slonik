// @flow

import {
  createUlid
} from '../utilities';
import {
  DataIntegrityError
} from '../errors';
import type {
  InternalQueryMaybeOneFirstFunctionType
} from '../types';
import log from '../Logger';
import maybeOne from './maybeOne';

/**
 * Makes a query and expects exactly one result.
 * Returns value of the first column.
 *
 * @throws DataIntegrityError If query returns multiple rows.
 */
const maybeOneFirst: InternalQueryMaybeOneFirstFunctionType = async (connection, clientConfiguration, rawSql, values, queryId = createUlid()) => {
  const row = await maybeOne(connection, clientConfiguration, rawSql, values, queryId);

  if (!row) {
    return null;
  }

  const keys = Object.keys(row);

  if (keys.length !== 1) {
    log.error({
      queryId
    }, 'DataIntegrityError');

    throw new DataIntegrityError();
  }

  return row[keys[0]];
};

export default maybeOneFirst;
