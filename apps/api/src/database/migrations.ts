import { Sequelize } from 'sequelize-typescript';
import { SequelizeStorage, Umzug } from 'umzug';
import * as initial from './migrations/001-initial';
import * as reviews from './migrations/002-operation-reviews';
import * as latestDeployment from './migrations/003-latest-deployment';

export function migrations(sequelize: Sequelize) {
  return new Umzug({
    migrations: [
      { name: '001-initial', ...initial },
      { name: '002-operation-reviews', ...reviews },
      { name: '003-latest-deployment', ...latestDeployment },
    ],
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: undefined,
  });
}

export function database(url: string): Sequelize {
  return new Sequelize(url, { dialect: 'postgres', logging: false });
}
