import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs } from 'expo-router'

import { useAutoSync } from '@/hooks/use-auto-sync'
import { useAuth } from '@/context/auth'

export default function TabsLayout() {
  const { user } = useAuth()
  useAutoSync(Boolean(user?.onboardingComplete))

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0f1f36' },
        headerTintColor: '#e8edf5',
        tabBarStyle: { backgroundColor: '#0a1628', borderTopColor: 'rgba(255,255,255,0.08)' },
        tabBarActiveTintColor: '#0dccb0',
        tabBarInactiveTintColor: '#6b7a96',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="sitrep"
        options={{
          title: 'SitRep',
          tabBarIcon: ({ color, size }) => <Ionicons name="document-text" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="voting"
        options={{
          title: 'Vote tally',
          tabBarIcon: ({ color, size }) => <Ionicons name="checkbox" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="incidents"
        options={{
          title: 'Incidents',
          tabBarIcon: ({ color, size }) => <Ionicons name="warning" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Ionicons name="menu" color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
