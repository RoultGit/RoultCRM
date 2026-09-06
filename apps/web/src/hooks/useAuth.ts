import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient, setAccessToken } from '../lib/api.js';

interface LoginInput {
  email: string;
  password: string;
}

export function useLogin() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const res = await apiClient.post<{ accessToken: string }>('/auth/login', input);
      return res.data;
    },
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      navigate('/');
    },
  });
}
