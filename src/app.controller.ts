import { Controller, Get, Header } from '@nestjs/common';
import { ResourceOptimizerService } from './orchestration/resource-optimizer.service';

// @Controller()
// export class AppController {
//   constructor(private readonly appService: AppService) {}

//   @Get()
//   getHello(): string {
//     return this.appService.getHello();
//   }
// }

@Controller()
export class AppController {
  constructor(
    private readonly resourceOptimizer: ResourceOptimizerService
  ) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain')
  async getMetrics() {
    return this.resourceOptimizer.getMetrics();
  }
}
