import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cloud, Sun, CloudRain, Wind, Thermometer, Droplets } from "lucide-react";

interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  location: string;
}

export default function RestrictedLanding() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [weather] = useState<WeatherData>({
    temperature: Math.floor(Math.random() * 15) + 10, // 10-25°C
    condition: ["Sunny", "Partly Cloudy", "Cloudy", "Light Rain"][Math.floor(Math.random() * 4)],
    humidity: Math.floor(Math.random() * 30) + 40, // 40-70%
    windSpeed: Math.floor(Math.random() * 10) + 5, // 5-15 km/h
    location: "London, UK"
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const getWeatherIcon = (condition: string) => {
    switch (condition) {
      case "Sunny":
        return <Sun className="h-12 w-12 text-yellow-500" />;
      case "Partly Cloudy":
        return <Cloud className="h-12 w-12 text-gray-400" />;
      case "Cloudy":
        return <Cloud className="h-12 w-12 text-gray-600" />;
      case "Light Rain":
        return <CloudRain className="h-12 w-12 text-blue-500" />;
      default:
        return <Sun className="h-12 w-12 text-yellow-500" />;
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        {/* Welcome Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome to Tropi Fruit</h1>
          <p className="text-lg text-gray-600">Your workspace portal</p>
        </div>

        {/* Time and Date Card */}
        <Card className="mb-6 shadow-lg">
          <CardContent className="p-8 text-center">
            <div className="text-6xl font-bold text-indigo-600 mb-2">
              {formatTime(currentTime)}
            </div>
            <div className="text-xl text-gray-600">
              {formatDate(currentTime)}
            </div>
          </CardContent>
        </Card>

        {/* Weather Card */}
        <Card className="mb-6 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Thermometer className="h-5 w-5" />
              Weather Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-center justify-center">
                {getWeatherIcon(weather.condition)}
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Location:</span>
                  <span className="font-semibold">{weather.location}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Temperature:</span>
                  <span className="font-semibold">{weather.temperature}°C</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Condition:</span>
                  <span className="font-semibold">{weather.condition}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 flex items-center gap-1">
                    <Droplets className="h-4 w-4" />
                    Humidity:
                  </span>
                  <span className="font-semibold">{weather.humidity}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 flex items-center gap-1">
                    <Wind className="h-4 w-4" />
                    Wind Speed:
                  </span>
                  <span className="font-semibold">{weather.windSpeed} km/h</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg">System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-green-600 font-semibold">Online</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">All systems operational</p>
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg">Today's Date</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-600">
                {currentTime.getDate()}
              </div>
              <p className="text-sm text-gray-600">
                {currentTime.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg">Access Level</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold text-blue-600">
                Standard User
              </div>
              <p className="text-sm text-gray-600 mt-2">Limited access granted</p>
            </CardContent>
          </Card>
        </div>

        {/* Footer Message */}
        <div className="text-center mt-8 p-4 bg-white rounded-lg shadow-lg">
          <p className="text-gray-600">
            Contact your administrator if you need access to additional features.
          </p>
        </div>
      </div>
    </div>
  );
}