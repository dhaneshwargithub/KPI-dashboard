import { Component, OnInit } from '@angular/core';
import { CouchdbService } from '../couchdb.service';
import { Sale } from '../models/sales-data';
import { Chart, registerables, ChartType } from 'chart.js';
import 'chartjs-adapter-date-fns';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  salesData: Sale[] = [];
  totalSales = 0;
  totalProfit = 0;
  salesByRegion: { [key: string]: number } = {};
  topCategories: { [key: string]: number } = {};
  salesTrend: { x: Date, y: number }[] = [];
  profitMargin = 0;
  profitDistribution: { [key: string]: number } = {};
  monthlyRevenue: { [key: string]: { [category: string]: number } } = {};

  // New KPIs
  customerAcquisitionCost = 0;
  customerLifetimeValue = 0;
  averageFulfillmentTime = 0;
  returnOnInvestment = 0;

  pollingInterval = 60000; // 60 seconds

  constructor(private couchdbService: CouchdbService) {}

  ngOnInit(): void {
    this.loadSalesData();
    this.startPolling();
  }

  loadSalesData() {
    this.couchdbService.getSalesData().subscribe(
      (sales: Sale[]) => {
        this.salesData = sales;
        this.calculateKPIs();
        this.renderCharts();
      },
      error => {
        console.error('Error fetching sales data:', error);
      }
    );
  }

  startPolling() {
    setInterval(() => {
      this.couchdbService.getSalesData().subscribe(
        (sales: Sale[]) => {
          this.salesData = sales;
          this.calculateKPIs();
          this.renderCharts();
        },
        error => {
          console.error('Error fetching sales data:', error);
        }
      );
    }, this.pollingInterval);
  }

  calculateKPIs() {
    this.totalSales = this.salesData.reduce((sum, record) => sum + (record.Sales || 0), 0);
    this.totalProfit = this.salesData.reduce((sum, record) => sum + (record.Profit || 0), 0);

    this.salesByRegion = this.salesData.reduce((acc, record) => {
      if (record.Region) {
        acc[record.Region] = (acc[record.Region] || 0) + (record.Sales || 0);
      }
      return acc;
    }, {} as { [key: string]: number });

    this.topCategories = this.salesData.reduce((acc, record) => {
      if (record.Category) {
        acc[record.Category] = (acc[record.Category] || 0) + (record.Sales || 0);
      }
      return acc;
    }, {} as { [key: string]: number });

    this.topCategories = Object.fromEntries(
      Object.entries(this.topCategories).sort(([, a], [, b]) => b - a)
    );

    this.profitDistribution = this.salesData.reduce((acc, record) => {
      if (record.Country) {
        acc[record.Country] = (acc[record.Country] || 0) + (record.Profit || 0);
      }
      return acc;
    }, {} as { [key: string]: number });

    this.salesTrend = this.salesData.reduce((acc, record) => {
      let orderDate = new Date(record.Order_Date);
      if (isNaN(orderDate.getTime())) {
        orderDate = new Date(0);
      }

      const halfYearStart = orderDate.getMonth() < 6 
        ? new Date(orderDate.getFullYear(), 0, 1)
        : new Date(orderDate.getFullYear(), 6, 1); 

      const foundPeriod = acc.find(d => d.x.getTime() === halfYearStart.getTime());
      if (foundPeriod) {
        foundPeriod.y += record.Sales;
      } else {
        acc.push({ x: halfYearStart, y: record.Sales });
      }

      return acc;
    }, [] as { x: Date, y: number }[]);

    this.profitMargin = this.totalSales > 0 ? (this.totalProfit / this.totalSales) * 100 : 0;

    this.customerAcquisitionCost = this.calculateCustomerAcquisitionCost();
    this.customerLifetimeValue = this.calculateCustomerLifetimeValue();
    this.averageFulfillmentTime = this.calculateAverageFulfillmentTime() || 0;
    this.returnOnInvestment = this.calculateReturnOnInvestment();

    this.monthlyRevenue = this.salesData.reduce((acc, record) => {
      const month = new Date(record.Order_Date).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      if (!acc[month]) {
        acc[month] = {};
      }
      if (record.Category) {
        acc[month][record.Category] = (acc[month][record.Category] || 0) + (record.Sales || 0);
      }
      return acc;
    }, {} as { [key: string]: { [category: string]: number } });
  }

  calculateCustomerAcquisitionCost(): number {
    return this.totalSales / (this.salesData.length || 1);
  }

  calculateCustomerLifetimeValue(): number {
    return this.totalProfit / (this.salesData.length || 1);
  }

  calculateAverageFulfillmentTime(): number | null {
  
    const validRecords = this.salesData.filter(record => {
      const orderDate = new Date(record.Order_Date);
      const shipDate = new Date(record.Ship_Date);
      return !isNaN(orderDate.getTime()) && !isNaN(shipDate.getTime());
    });
  
    if (validRecords.length === 0) {
      
      return null;
    }
  
    // Calculate fulfillment times in days
    const fulfillmentTimes = validRecords.map(record => {
      const orderDate = new Date(record.Order_Date);
      const shipDate = new Date(record.Ship_Date);
      const diffInMs = shipDate.getTime() - orderDate.getTime();
      return diffInMs / (1000 * 60 * 60 * 24); // Convert ms to days
    });
  
  
    function calculateMedian(values: number[]): number {
      if (values.length === 0) return 0;
      const sorted = values.slice().sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2;
      } else {
        return sorted[middle];
      }
    }
  
    
    const medianFulfillmentTime = calculateMedian(fulfillmentTimes);
  

    const meanFulfillmentTime = fulfillmentTimes.reduce((a, b) => a + b, 0) / fulfillmentTimes.length;
    
    return medianFulfillmentTime > 0 ? medianFulfillmentTime : (meanFulfillmentTime > 0 ? meanFulfillmentTime : null);
  }

  calculateReturnOnInvestment(): number {
    return (this.totalProfit / this.totalSales) * 100;
  }

  renderCharts() {
    this.renderChart('salesTrendChart', 'line', {
      datasets: [{
        label: 'Sales Trend',
        data: this.salesTrend,
        borderColor: 'rgba(75, 192, 192, 1)',
        fill: false
      }]
    }, {
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'month'
          },
          ticks: {
            callback: function(value: any) {
              return new Date(value).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            }
          }
        },
        y: {
          beginAtZero: true
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(tooltipItem: any) {
              return `Sales: ${tooltipItem.raw.y.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`;
            }
          }
        }
      }
    });

    this.renderChart('salesByRegionChart', 'bar', {
      labels: Object.keys(this.salesByRegion),
      datasets: [{
        label: 'Sales by Region',
        data: Object.values(this.salesByRegion),
        backgroundColor: 'rgba(153, 102, 255, 0.2)',
        borderColor: 'rgba(153, 102, 255, 1)',
        borderWidth: 1
      }]
    }, {
      scales: {
        y: {
          beginAtZero: true
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(tooltipItem: any) {
              return `Sales: ${tooltipItem.raw.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`;
            }
          }
        }
      }
    });

    this.renderChart('topCategoriesChart', 'pie', {
      labels: Object.keys(this.topCategories),
      datasets: [{
        label: 'Top Categories by Sales',
        data: Object.values(this.topCategories),
        backgroundColor: [
          'rgba(255, 99, 132, 0.2)',
          'rgba(54, 162, 235, 0.2)',
          'rgba(255, 206, 86, 0.2)',
          'rgba(75, 192, 192, 0.2)',
          'rgba(153, 102, 255, 0.2)',
          'rgba(255, 159, 64, 0.2)'
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(255, 159, 64, 1)'
        ],
        borderWidth: 1
      }]
    }, {
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: {
            label: function(tooltipItem: any) {
              return `Sales: ${tooltipItem.raw.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`;
            }
          }
        }
      }
    });

    this.renderChart('profitDistributionChart', 'doughnut', {
      labels: Object.keys(this.profitDistribution),
      datasets: [{
        label: 'Profit Distribution by Country',
        data: Object.values(this.profitDistribution),
        backgroundColor: [
          'rgba(255, 99, 132, 0.2)',
          'rgba(54, 162, 235, 0.2)',
          'rgba(255, 206, 86, 0.2)',
          'rgba(75, 192, 192, 0.2)',
          'rgba(153, 102, 255, 0.2)',
          'rgba(255, 159, 64, 0.2)'
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(255, 159, 64, 1)'
        ],
        borderWidth: 1
      }]
    }, {
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: {
            label: function(tooltipItem: any) {
              return `Profit: ${tooltipItem.raw.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`;
            }
          }
        }
      }
    });

    if (Object.keys(this.monthlyRevenue).length > 0) {
      // Wait for the view to be fully rendered
      setTimeout(() => {
        const ctx = document.getElementById('monthlyRevenueBreakdownChart') as HTMLCanvasElement;
        if (ctx) {
          new Chart(ctx, {
            type: 'bar',
            data: {
              labels: Object.keys(this.monthlyRevenue),
              datasets: Object.keys(this.monthlyRevenue[Object.keys(this.monthlyRevenue)[0]]).map(category => ({
                label: category,
                data: Object.keys(this.monthlyRevenue).map(month => this.monthlyRevenue[month][category] || 0),
                backgroundColor: this.getCategoryColor(category),
                borderColor: this.getCategoryColor(category, true),
                borderWidth: 1
              }))
            },
            options: {
              scales: {
                x: {
                  stacked: true
                },
                y: {
                  beginAtZero: true,
                  stacked: true
                }
              },
              plugins: {
                tooltip: {
                  callbacks: {
                    label: function(tooltipItem: any) {
                      return `Sales: ${tooltipItem.raw.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`;
                    }
                  }
                }
              }
            }
          });
        } else {
          console.error('Canvas element for monthlyRevenueChart not found.');
        }
      });
    }
  }

  renderChart(chartId: string, type: ChartType, data: any, options: any) {
    const ctx = document.getElementById(chartId) as HTMLCanvasElement;
    if (ctx) {
      new Chart(ctx, {
        type: type,
        data: data,
        options: options
      });
    }
  }

  getCategoryColor(category: string, border = false): string {
    const colors: { [key: string]: string } = {
      'Category1': 'rgba(255, 99, 132, 0.2)',
      'Category2': 'rgba(54, 162, 235, 0.2)',
      'Category3': 'rgba(255, 206, 86, 0.2)',
      'Category4': 'rgba(75, 192, 192, 0.2)',
      'Category5': 'rgba(153, 102, 255, 0.2)',
      'Category6': 'rgba(255, 159, 64, 0.2)',
      'Category7': 'rgba(199, 199, 199, 0.2)',
      'Category8': 'rgba(83, 102, 255, 0.2)',
    };
    const borderColors: { [key: string]: string } = {
      'Category1': 'rgba(255, 99, 132, 1)',
      'Category2': 'rgba(54, 162, 235, 1)',
      'Category3': 'rgba(255, 206, 86, 1)',
      'Category4': 'rgba(75, 192, 192, 1)',
      'Category5': 'rgba(153, 102, 255, 1)',
      'Category6': 'rgba(255, 159, 64, 1)',
      'Category7': 'rgba(199, 199, 199, 1)',
      'Category8': 'rgba(83, 102, 255, 1)',
    };

    if (!colors[category]) {
      const randomColor = `rgba(${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, ${border ? 1 : 0.2})`;
      return border ? randomColor.replace('0.2', '1') : randomColor;
    }
    return border ? borderColors[category] || 'rgba(0,0,0,1)' : colors[category] || 'rgba(0,0,0,0.2)';
  }
}
