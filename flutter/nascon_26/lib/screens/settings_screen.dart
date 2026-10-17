import 'package:flutter/material.dart';
import '../core/app_state.dart';
import '../widgets/ui.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}
class _SettingsScreenState extends State<SettingsScreen> {
  late TextEditingController url;
  final email = TextEditingController(text:'viewer@nascon.test');
  final password = TextEditingController(text:'Nascon@26');
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    url = TextEditingController(text: AppStateScope.of(context).serverUrl);
  }
  @override
  void dispose() { url.dispose(); email.dispose(); password.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final state = AppStateScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Settings & access')),
      body: ListView(padding: const EdgeInsets.all(18), children: [
        const Eyebrow('Environment'),
        const SizedBox(height:8),
        const Text('Connect your backend',style:TextStyle(fontSize:25,fontWeight:FontWeight.w900)),
        const SizedBox(height:8),
        const Text('Android emulator: 10.0.2.2:8080 · Physical phone: laptop LAN IP and port 8080.',style:TextStyle(color:muted,height:1.5)),
        const SizedBox(height:14),
        Panel(child: Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          TextField(controller:url,decoration:const InputDecoration(labelText:'API base URL',prefixIcon:Icon(Icons.link_rounded))),
          const SizedBox(height:12),
          PrimaryButton(label:'Save & test connection',icon:Icons.wifi_tethering_rounded,onPressed:() async {
            await state.setServerUrl(url.text);
            if(context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(state.online?'Backend connected.':'Could not reach backend. Check URL and server.')));
          }),
        ])),
        const SizedBox(height:22),
        const Eyebrow('Demo sign-in'),
        const SizedBox(height:8),
        const Text('Role-aware access',style:TextStyle(fontSize:25,fontWeight:FontWeight.w900)),
        const SizedBox(height:8),
        const Text('Use the demo accounts defined in the Day 1 specification. These local sign-in controls are for the UI demo; backend authentication must still be implemented by the team.',style:TextStyle(color:muted,height:1.5)),
        const SizedBox(height:14),
        Panel(child: Column(children:[
          TextField(controller:email,keyboardType:TextInputType.emailAddress,decoration:const InputDecoration(labelText:'Email',prefixIcon:Icon(Icons.alternate_email_rounded))),
          const SizedBox(height:10),
          TextField(controller:password,obscureText:true,decoration:const InputDecoration(labelText:'Password',prefixIcon:Icon(Icons.lock_outline_rounded))),
          const SizedBox(height:12),
          PrimaryButton(label:'Sign in',icon:Icons.login_rounded,onPressed:() async {
            try {
              await state.signIn(email.text,password.text);
              if(context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('Signed in as ${state.role}.')));
            } catch(e) {
              if(context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(e.toString().replaceAll('Exception: ',''))));
            }
          }),
          const SizedBox(height:8),
          SizedBox(width:double.infinity,child:OutlinedButton.icon(onPressed:() async {await state.signOut(); if(context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Signed out.')));},icon:const Icon(Icons.logout_rounded),label:const Text('Sign out'))),
        ])),
        const SizedBox(height:18),
        const Panel(child: Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Eyebrow('Design decision'),
          SizedBox(height:8),
          Text('Clear state over clever state',style:TextStyle(fontSize:16,fontWeight:FontWeight.w900)),
          SizedBox(height:6),
          Text('Persistent offline queue, always-visible connectivity, plain-language errors, large tap targets and role-aware actions make the app easier to judge and safer to use.',style:TextStyle(color:muted,height:1.5,fontSize:12)),
        ])),
      ]),
    );
  }
}
