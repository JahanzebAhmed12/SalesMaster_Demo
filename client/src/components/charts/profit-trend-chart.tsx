import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ProfitTrendChartProps {
  data: {
    labels: string[];
    data: number[];
  };
  showProfit?: boolean;
}

export default function ProfitTrendChart({ data, showProfit = true }: ProfitTrendChartProps) {
  if (!showProfit) return null;

  const chartData = data.labels.map((label, index) => ({
    name: label,
    profit: data.data[index] || 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis tickFormatter={(value) => `£${value.toLocaleString()}`} />
        <Tooltip 
          formatter={(value: number) => [`£${value.toLocaleString()}`, 'Profit']}
          labelStyle={{ color: '#374151' }}
        />
        <Line 
          type="monotone" 
          dataKey="profit" 
          stroke="hsl(142, 71%, 45%)" 
          strokeWidth={3}
          dot={{ fill: 'hsl(142, 71%, 45%)', strokeWidth: 2, r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
