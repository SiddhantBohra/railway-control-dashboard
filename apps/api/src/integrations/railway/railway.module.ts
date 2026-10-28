import { Module } from '@nestjs/common';
import { Config } from '../../config/config';
import { RailwayLifecycle } from './railway.boundary';
import { RailwayAdapter } from './railway.adapter';
import { RailwayGraphqlClient } from './graphql.client';
import { MockRailwayAdapter } from './mock.adapter';

@Module({
  providers: [
    RailwayGraphqlClient,
    RailwayAdapter,
    MockRailwayAdapter,
    {
      provide: RailwayLifecycle,
      inject: [Config, RailwayAdapter, MockRailwayAdapter],
      useFactory: (config: Config, railway: RailwayAdapter, mock: MockRailwayAdapter) =>
        config.values.PROVIDER_MODE === 'railway' ? railway : mock,
    },
  ],
  exports: [RailwayLifecycle],
})
export class RailwayModule {}
