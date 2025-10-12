import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SalesPurchaseChartProps {
  data: {
    labels: string[];
    salesData: number[];
    purchaseData: number[];
  };
}

export default function SalesPurchaseChart({ data }: SalesPurchaseChartProps) {
  const chartData = data.labels.map((label, index) => ({
    name: label,
    sales: data.salesData[index] || 0,
    purchases: data.purchaseData[index] || 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis tickFormatter={(value) => `£${value.toLocaleString()}`} />
        <Tooltip
          formatter={(value: number) => [`£${value.toLocaleString()}`, '']}
          labelStyle={{ color: '#374151' }}
        />
        <Legend />
        <Bar dataKey="sales" fill="hsl(207, 90%, 54%)" name="Sales" />
        <Bar dataKey="purchases" fill="hsl(38, 92%, 50%)" name="Purchases" />
      </BarChart>
    </ResponsiveContainer>
  );
}
